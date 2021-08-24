package bytebank;

public class Conta { //classe blueprint planta para crianção de objetos
	double saldo;
	int agencia; //atributos
	int numero;
	Cliente titular;
	
	public void deposita(double valor) { //valor é um argumento do método, métodos lembram funções
		this.saldo += valor; //this quer dizer para o objeto específico que chamou o metodo
	}
	
	public boolean saca(double valor) {
		if(this.saldo >= valor) {
			this.saldo -= valor; //this mais uma vez se referindo ao objeto que chamou o metodo
			return true;
		} else {
			return false;
		}
	}
	
	public boolean transfere(double valor, Conta destino) {
		if(this.saldo >= valor) {
			saca(valor);
			destino.deposita(valor);
			return true;
		}
		return false;  
		
	}
	
	
}
 