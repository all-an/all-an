package bytebank;

public class TesteSacaNegativo {
	public static void main(String[] args) {
		Conta conta = new Conta();
		
		conta.deposita(100); //retorno de um método
		
		System.out.println(conta.saca(200)); //retorno de um método já como argumento do método System.out.println
		
		/*conta.saldo -= 101; 
		proibido já que saldo só pode ser acessado pelos métodos da classe que o contem, neste caso Conta*/
		
		System.out.println(conta.getSaldo()); 
		
	}

	
}
