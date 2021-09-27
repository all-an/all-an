using System;

namespace _06_ByteBank
{
    class Program
    {
        static void Main(string[] args)
        {

            ContaCorrente conta = new ContaCorrente();

            conta.saldo = -10;

            Console.WriteLine(conta.ObterSaldo());
        }
    }
}
