package bytebank;

public class TestaContaSemCliente {
	public static void main(String[] args) {
		
		Conta contaDaMarcela = new Conta();
		
		System.out.println(contaDaMarcela.getSaldo());
		
		contaDaMarcela.titular = new Cliente();  
		//titular j� pertence a classe Conta referenciada acima, pode-se referenciar direto aos atributos de Cliente
		
		System.out.println(contaDaMarcela.titular);
		contaDaMarcela.titular.nome = "Marcela";  
		
		System.out.println(contaDaMarcela.titular.nome); 
		 
	}
}
